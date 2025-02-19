"use client"
import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { AlertCircle, Archive, GitBranch, ChevronDown, Trash2, ArchiveX } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination"
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"

interface Branch {
  name: string
  commit: {
    sha: string
    url: string
  }
  protected: boolean
  selected?: boolean
}

type Operation = 'archive-only' | 'archive-and-delete' | 'delete-only'

const ITEMS_PER_PAGE = 10

export default function RepositoryPage() {
  const params = useParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [branches, setBranches] = useState<Branch[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [totalBranches, setTotalBranches] = useState(0)
  const [archiving, setArchiving] = useState(false)
  const [lastArchived, setLastArchived] = useState<string[] | null>(null)
  const [operation, setOperation] = useState<Operation>('archive-and-delete')
  const [confirmationOpen, setConfirmationOpen] = useState(false)
  const [pendingOperation, setPendingOperation] = useState<{
    operation: Operation
    branches: string[]
  } | null>(null)
  const [confirmationInput, setConfirmationInput] = useState("")

  const owner = params.owner as string
  const name = params.name as string

  const totalPages = Math.ceil(branches.length / ITEMS_PER_PAGE)
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
  const endIndex = startIndex + ITEMS_PER_PAGE
  const currentBranches = branches.slice(startIndex, endIndex)

  useEffect(() => {
    fetchBranches()
  }, [owner, name])

  const fetchBranches = async () => {
    try {
      const token = localStorage.getItem("github_token")
      if (!token) {
        throw new Error("No authentication token found")
      }

      const response = await fetch(`/api/repositories/${owner}/${name}/branches`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        throw new Error("Failed to fetch branches")
      }

      const branchData = await response.json()
      const branchesWithSelection = branchData.map((branch: Branch) => ({
        ...branch,
        selected: false
      }))
      setBranches(branchesWithSelection)
      setTotalBranches(branchesWithSelection.length)
      setLoading(false)
    } catch (error) {
      console.error("Error fetching branches:", error)
      setError("Failed to fetch branches")
      setLoading(false)
    }
  }

  const handleSelectAll = () => {
    setBranches(branches.map(branch => ({
      ...branch,
      selected: true
    })))
  }

  const handleUnselectAll = () => {
    setBranches(branches.map(branch => ({
      ...branch,
      selected: false
    })))
  }

  const toggleBranch = (index: number) => {
    setBranches(branches.map((branch, i) => 
      i === index ? { ...branch, selected: !branch.selected } : branch
    ))
  }

  const handleOperation = async (op: Operation) => {
    const selectedBranches = branches.filter(b => b.selected).map(b => b.name)
    
    if (op !== 'archive-only') {
      setPendingOperation({ operation: op, branches: selectedBranches })
      setConfirmationOpen(true)
      return
    }

    await processOperation(op, selectedBranches)
  }

  const processOperation = async (op: Operation, selectedBranches: string[]) => {
    setArchiving(true)
    setError(null)
    setLastArchived(null)
    
    try {
      const token = localStorage.getItem("github_token")
      if (!token) {
        throw new Error("No authentication token found")
      }

      if (op !== 'delete-only') {
        const tagCheckPromises = selectedBranches.map(async (branch) => {
          const tagName = `archive/${branch.replace(/\//g, '-')}`
          const response = await fetch(
            `https://api.github.com/repos/${owner}/${name}/git/refs/tags/${tagName}`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/vnd.github.v3+json",
              },
            }
          )
          return { branch, tagExists: response.status === 200 }
        })

        const tagChecks = await Promise.all(tagCheckPromises)
        const existingTags = tagChecks.filter(check => check.tagExists)
        
        if (existingTags.length > 0) {
          setError(`Cannot process: Tags already exist for branches: ${existingTags.map(t => t.branch).join(', ')}`)
          setArchiving(false)
          return
        }
      }

      const response = await fetch(`/api/repositories/${owner}/${name}/archive`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          branches: selectedBranches,
          operation: op
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to process branches")
      }

      const { results } = await response.json()
      
      const successfulOperations = results.filter(r => r.success)
      const failedOperations = results.filter(r => !r.success)

      if (successfulOperations.length > 0) {
        const messages = successfulOperations.map(r => {
          const action = r.archived && r.deleted ? 'archived and deleted' :
                        r.archived ? 'archived' : 'deleted'
          return `${r.branch} (${action})`
        })
        setLastArchived(messages)
        
        if (op !== 'archive-only') {
          setBranches(branches.filter(b => 
            !successfulOperations.find(r => r.branch === b.name && r.deleted)
          ))
        }

        setBranches(prev => prev.map(branch => ({
          ...branch,
          selected: false
        })))
      }

      if (failedOperations.length > 0) {
        setError(`Failed operations: ${failedOperations.map(r => `${r.branch} (${r.error})`).join(', ')}`)
      }

    } catch (error) {
      console.error("Error processing branches:", error)
      setError("Failed to process branches")
    } finally {
      setArchiving(false)
    }
  }

  const getConfirmationWord = (op: Operation) => {
    switch (op) {
      case 'delete-only':
        return 'delete'
      case 'archive-and-delete':
        return 'archive-delete'
      case 'archive-only':
        return 'archive'
      default:
        return ''
    }
  }

  if (loading) {
    return <div>Loading repository details...</div>
  }

  return (
    <Card className="w-full max-w-2xl mx-auto mt-8">
      <CardHeader>
        <CardTitle>Repository: {owner}/{name}</CardTitle>
        <CardDescription>Total Branches: {totalBranches}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex gap-4">
            <Button 
              variant="outline" 
              onClick={handleSelectAll}
              className="flex items-center gap-2"
            >
              Select All
            </Button>
            <Button 
              variant="outline" 
              onClick={handleUnselectAll}
              className="flex items-center gap-2"
            >
              Unselect All
            </Button>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="default"
                  disabled={!branches.some(b => b.selected) || archiving}
                  className="flex items-center gap-2 ml-auto"
                >
                  {archiving ? 'Processing...' : 'Process Selected'}
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => handleOperation('archive-only')}>
                  <Archive className="h-4 w-4 mr-2" />
                  Archive Only
                </DropdownMenuItem>
                {/* Commenting out delete operations for now
                <DropdownMenuItem onClick={() => handleOperation('archive-and-delete')}>
                  <ArchiveX className="h-4 w-4 mr-2" />
                  Archive and Delete
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleOperation('delete-only')}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Only
                </DropdownMenuItem>
                */}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {lastArchived && lastArchived.length > 0 && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Successfully processed: {lastArchived.join(', ')}
              </AlertDescription>
            </Alert>
          )}

          <div className="border rounded-lg">
            <div className="grid grid-cols-[auto,1fr,auto] gap-4 p-4 border-b bg-muted/50">
              <div>Select</div>
              <div>Branch Name</div>
              <div>Protected</div>
            </div>
            <div className="divide-y">
              {currentBranches.map((branch, index) => (
                <div 
                  key={branch.name}
                  className="grid grid-cols-[auto,1fr,auto] gap-4 p-4 items-center hover:bg-muted/50"
                >
                  <Checkbox
                    checked={branch.selected}
                    onCheckedChange={() => toggleBranch(startIndex + index)}
                    disabled={branch.protected}
                  />
                  <div className="flex items-center gap-2">
                    <GitBranch className="h-4 w-4 text-muted-foreground" />
                    {branch.name}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {branch.protected ? "Yes" : "No"}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {totalPages > 1 && (
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious 
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  />
                </PaginationItem>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <PaginationItem key={page}>
                    <PaginationLink
                      onClick={() => setCurrentPage(page)}
                      isActive={currentPage === page}
                    >
                      {page}
                    </PaginationLink>
                  </PaginationItem>
                ))}
                <PaginationItem>
                  <PaginationNext 
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
        </div>
      </CardContent>

      <AlertDialog open={confirmationOpen} onOpenChange={setConfirmationOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Branch Operation</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to {pendingOperation?.operation === 'delete-only' ? 'delete' : 'archive and delete'} the following branches:
              <ul className="mt-2 list-disc list-inside">
                {pendingOperation?.branches.map(branch => (
                  <li key={branch} className="text-sm">{branch}</li>
                ))}
              </ul>
              {pendingOperation?.operation === 'delete-only' ? (
                <p className="mt-2 font-semibold text-destructive">Warning: This action will permanently delete these branches without creating archive tags!</p>
              ) : (
                <>
                  <p className="mt-2 font-semibold text-destructive">Warning: This action will permanently delete these branches after creating archive tags!</p>
                  <p className="mt-2">Archive tags will be created before deletion.</p>
                </>
              )}
              <div className="mt-4">
                <p className="text-sm text-muted-foreground mb-2">
                  Please type <span className="font-mono font-bold">{pendingOperation ? getConfirmationWord(pendingOperation.operation) : ''}</span> to confirm
                </p>
                <Input
                  value={confirmationInput}
                  onChange={(e) => setConfirmationInput(e.target.value)}
                  placeholder="Type confirmation word..."
                  className="max-w-[200px]"
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmationInput("")}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingOperation) {
                  processOperation(pendingOperation.operation, pendingOperation.branches)
                  setConfirmationOpen(false)
                  setConfirmationInput("")
                }
              }}
              className={pendingOperation?.operation === 'delete-only' ? 'bg-destructive hover:bg-destructive/90' : ''}
              disabled={confirmationInput !== (pendingOperation ? getConfirmationWord(pendingOperation.operation) : '')}
            >
              {pendingOperation?.operation === 'delete-only' ? 'Delete Branches' : 'Archive and Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
} 