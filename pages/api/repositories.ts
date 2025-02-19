import type { NextApiRequest, NextApiResponse } from "next"
import jwt from "jsonwebtoken"

const JWT_SECRET = process.env.JWT_SECRET

interface Repository {
  id: number
  name: string
  full_name: string
  clone_url: string
  default_branch: string
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  if (!JWT_SECRET) {
    console.error("JWT_SECRET is not set")
    return res.status(500).json({ error: "Server configuration error" })
  }

  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid authorization header" })
  }

  const token = authHeader.split(" ")[1]
  
  try {
    console.log("Received token:", token)
    
    const decoded = jwt.verify(token, JWT_SECRET) as { github_token: string }
    const githubToken = decoded.github_token

    console.log("Using GitHub token:", githubToken.slice(0, 10) + "...")
    
    // First, let's check the user's permissions
    const userResponse = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: "application/vnd.github.v3+json",
      },
    })

    if (!userResponse.ok) {
      const userError = await userResponse.json()
      console.error("GitHub User API error:", {
        status: userResponse.status,
        headers: Object.fromEntries(userResponse.headers.entries()),
        error: userError
      })
      return res.status(userResponse.status).json({ error: "GitHub User API error", details: userError })
    }

    const userData = await userResponse.json()
    console.log("Authenticated as user:", userData.login)

    // Get user's organizations
    const orgsResponse = await fetch("https://api.github.com/user/orgs", {
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: "application/vnd.github.v3+json",
      },
    })

    if (!orgsResponse.ok) {
      console.error("Failed to fetch organizations:", await orgsResponse.json())
    } else {
      const orgs = await orgsResponse.json()
      console.log("User organizations:", orgs.map((org: any) => org.login))
    }

    console.log("Fetching repositories...")
    const response = await fetch(
      "https://api.github.com/user/repos?affiliation=owner,organization_member&per_page=100&sort=updated", 
      {
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    )

    if (!response.ok) {
      const errorData = await response.json()
      console.error("GitHub Repos API error:", {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        error: errorData,
        rateLimit: {
          limit: response.headers.get('x-ratelimit-limit'),
          remaining: response.headers.get('x-ratelimit-remaining'),
          reset: response.headers.get('x-ratelimit-reset'),
        }
      })
      return res.status(response.status).json({ error: "GitHub API error", details: errorData })
    }

    const repos = await response.json()
    console.log(`Found ${repos.length} repositories`)
    console.log("Repository owners:", new Set(repos.map((repo: any) => repo.owner.login)))

    const formattedRepos: Repository[] = repos.map((repo: any) => ({
      id: repo.id,
      name: repo.name,
      full_name: repo.full_name,
      clone_url: repo.clone_url,
      default_branch: repo.default_branch,
    }))

    return res.status(200).json(formattedRepos)
  } catch (error) {
    // Add more detailed error logging
    if (error instanceof jwt.JsonWebTokenError) {
      console.error("JWT Error:", error.message)
      return res.status(401).json({ error: "Invalid token", details: error.message })
    }
    
    console.error("Error fetching repositories:", error)
    return res.status(500).json({ error: "Internal server error" })
  }
}

