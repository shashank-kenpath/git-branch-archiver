import { NextApiRequest, NextApiResponse } from "next"
import jwt from "jsonwebtoken"

const JWT_SECRET = process.env.JWT_SECRET!

type Operation = 'archive-only' | 'archive-and-delete' | 'delete-only'

async function checkTagExists(owner: string, name: string, tagName: string, githubToken: string): Promise<boolean> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${name}/git/refs/tags/${tagName}`,
      {
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    )
    return response.status === 200
  } catch (error) {
    return false
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  const { owner, name } = req.query
  const { branches, operation, tagPrefix = 'archive' } = req.body

  if (!Array.isArray(branches)) {
    return res.status(400).json({ error: "Branches must be an array" })
  }

  if (!operation || !['archive-only', 'archive-and-delete', 'delete-only'].includes(operation)) {
    return res.status(400).json({ error: "Invalid operation" })
  }

  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid authorization header" })
  }

  const token = authHeader.split(" ")[1]

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { github_token: string }
    const githubToken = decoded.github_token

    const results = await Promise.all(
      branches.map(async (branch) => {
        try {
          // Get the branch reference
          const refResponse = await fetch(
            `https://api.github.com/repos/${owner}/${name}/git/refs/heads/${branch}`,
            {
              headers: {
                Authorization: `Bearer ${githubToken}`,
                Accept: "application/vnd.github.v3+json",
              },
            }
          )

          if (!refResponse.ok) {
            throw new Error(`Branch not found: ${branch}`)
          }

          const refData = await refResponse.json()
          const sha = refData.object.sha
          let tagName = ''

          // Check for existing tag first if operation includes archiving
          if (operation !== 'delete-only') {
            tagName = `${tagPrefix}/${branch.replace(/\//g, '-')}`
            const tagExists = await checkTagExists(owner as string, name as string, tagName, githubToken)
            
            if (tagExists) {
              throw new Error(`Tag ${tagName} already exists`)
            }

            // Create tag
            const createTagResponse = await fetch(
              `https://api.github.com/repos/${owner}/${name}/git/refs`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${githubToken}`,
                  Accept: "application/vnd.github.v3+json",
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  ref: `refs/tags/${tagName}`,
                  sha: sha,
                }),
              }
            )

            if (!createTagResponse.ok) {
              throw new Error(`Failed to create tag: ${createTagResponse.statusText}`)
            }
          }

          // Delete branch if operation includes deletion
          if (operation !== 'archive-only') {
            // Check if it's the default branch
            const repoResponse = await fetch(
              `https://api.github.com/repos/${owner}/${name}`,
              {
                headers: {
                  Authorization: `Bearer ${githubToken}`,
                  Accept: "application/vnd.github.v3+json",
                },
              }
            )
            
            if (!repoResponse.ok) {
              throw new Error("Failed to fetch repository details")
            }
            
            const repoData = await repoResponse.json()
            if (branch === repoData.default_branch) {
              throw new Error("Cannot delete default branch")
            }

            const deleteBranchResponse = await fetch(
              `https://api.github.com/repos/${owner}/${name}/git/refs/heads/${branch}`,
              {
                method: "DELETE",
                headers: {
                  Authorization: `Bearer ${githubToken}`,
                  Accept: "application/vnd.github.v3+json",
                },
              }
            )

            if (!deleteBranchResponse.ok) {
              throw new Error(`Failed to delete branch: ${deleteBranchResponse.statusText}`)
            }
          }

          return { 
            branch, 
            tagName,
            success: true,
            operation,
            archived: operation !== 'delete-only',
            deleted: operation !== 'archive-only'
          }
        } catch (error) {
          return { 
            branch, 
            error: error.message, 
            success: false, 
            operation
          }
        }
      })
    )

    return res.status(200).json({ results })
  } catch (error) {
    console.error("Error processing branches:", error)
    return res.status(500).json({ error: "Internal server error" })
  }
} 