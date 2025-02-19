"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { AlertCircle, Github, Search, User, Building2 } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

interface Repository {
  id: number
  name: string
  full_name: string
  clone_url: string
  default_branch: string
  owner: {
    login: string
    type: string
  }
}

interface Organization {
  login: string
  avatar_url: string
}

const RepositorySelector = ({ token, onSelectRepo }: { token: string; onSelectRepo: (repo: Repository) => void }) => {
  const [repositories, setRepositories] = useState<Repository[]>([])
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedOrg, setSelectedOrg] = useState<string | null>(null)

  useEffect(() => {
    fetchRepositories()
    fetchOrganizations()
  }, [])

  const fetchOrganizations = async () => {
    try {
      const response = await fetch("/api/organizations", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        throw new Error("Failed to fetch organizations")
      }

      const data = await response.json()
      setOrganizations(data)
    } catch (error) {
      console.error("Error fetching organizations:", error)
    }
  }

  const fetchRepositories = async () => {
    try {
      const response = await fetch("/api/repositories", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        throw new Error("Failed to fetch repositories")
      }

      const data = await response.json()
      setRepositories(data)
      setLoading(false)
    } catch (error) {
      setError("Failed to fetch repositories")
      setLoading(false)
    }
  }

  const personalRepos = repositories.filter(
    repo => 
      repo.owner?.type === "User" && 
      repo.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const getOrganizationRepos = (orgName: string) => {
    return repositories.filter(
      repo => 
        repo.owner?.login === orgName && 
        repo.name.toLowerCase().includes(searchTerm.toLowerCase())
    )
  }

  return (
    <Card className="w-full max-w-2xl mx-auto mt-8">
      <CardHeader>
        <CardTitle>Select a Repository</CardTitle>
        <CardDescription>Choose a repository to archive branches</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <Search className="w-4 h-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Search repositories..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {loading ? (
            <p>Loading repositories...</p>
          ) : error ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : (
            <Tabs defaultValue="personal" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="personal" className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Personal
                </TabsTrigger>
                <TabsTrigger value="organizations" className="flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Organizations
                </TabsTrigger>
              </TabsList>

              <TabsContent value="personal" className="space-y-2">
                {personalRepos.map((repo) => (
                  <Button
                    key={repo.id}
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => onSelectRepo(repo)}
                  >
                    <Github className="w-4 h-4 mr-2" />
                    {repo.name}
                  </Button>
                ))}
                {personalRepos.length === 0 && (
                  <p className="text-sm text-muted-foreground">No personal repositories found</p>
                )}
              </TabsContent>

              <TabsContent value="organizations" className="space-y-4">
                {organizations.map((org) => (
                  <div key={org.login} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      <h3 className="font-medium">{org.login}</h3>
                    </div>
                    <div className="pl-6 space-y-2">
                      {getOrganizationRepos(org.login).map((repo) => (
                        <Button
                          key={repo.id}
                          variant="outline"
                          className="w-full justify-start"
                          onClick={() => onSelectRepo(repo)}
                        >
                          <Github className="w-4 h-4 mr-2" />
                          {repo.name}
                        </Button>
                      ))}
                      {getOrganizationRepos(org.login).length === 0 && (
                        <p className="text-sm text-muted-foreground">No repositories found</p>
                      )}
                    </div>
                  </div>
                ))}
                {organizations.length === 0 && (
                  <p className="text-sm text-muted-foreground">No organizations found</p>
                )}
              </TabsContent>
            </Tabs>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export default RepositorySelector

