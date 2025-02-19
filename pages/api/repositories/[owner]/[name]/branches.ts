import { NextApiRequest, NextApiResponse } from "next"
import jwt from "jsonwebtoken"

const JWT_SECRET = process.env.JWT_SECRET!

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  const { owner, name } = req.query

  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid authorization header" })
  }

  const token = authHeader.split(" ")[1]

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { github_token: string }
    const githubToken = decoded.github_token

    // Fetch all branches using pagination
    let allBranches = []
    let page = 1
    let hasNextPage = true

    while (hasNextPage) {
      const response = await fetch(
        `https://api.github.com/repos/${owner}/${name}/branches?per_page=100&page=${page}`,
        {
          headers: {
            Authorization: `Bearer ${githubToken}`,
            Accept: "application/vnd.github.v3+json",
          },
        }
      )

      if (!response.ok) {
        const error = await response.json()
        console.error("GitHub API error:", error)
        return res.status(response.status).json({ error: "GitHub API error", details: error })
      }

      const branches = await response.json()
      allBranches = [...allBranches, ...branches]

      // Check if there are more pages
      const linkHeader = response.headers.get('link')
      hasNextPage = linkHeader?.includes('rel="next"') ?? false
      page++

      // Safety check to prevent infinite loops
      if (page > 10) break // Maximum 1000 branches (10 pages * 100 branches)
    }

    return res.status(200).json(allBranches)
  } catch (error) {
    console.error("Error fetching branches:", error)
    return res.status(500).json({ error: "Internal server error" })
  }
} 