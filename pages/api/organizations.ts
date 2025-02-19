import type { NextApiRequest, NextApiResponse } from "next"
import jwt from "jsonwebtoken"

const JWT_SECRET = process.env.JWT_SECRET!

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid authorization header" })
  }

  const token = authHeader.split(" ")[1]

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { github_token: string }
    const githubToken = decoded.github_token

    const response = await fetch("https://api.github.com/user/orgs", {
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: "application/vnd.github.v3+json",
      },
    })

    if (!response.ok) {
      const error = await response.json()
      console.error("GitHub API error:", error)
      return res.status(response.status).json({ error: "GitHub API error", details: error })
    }

    const organizations = await response.json()
    return res.status(200).json(organizations)
  } catch (error) {
    console.error("Error fetching organizations:", error)
    return res.status(500).json({ error: "Internal server error" })
  }
} 