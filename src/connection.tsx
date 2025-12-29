import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { CheckCircle, AlertTriangle, XCircle, Loader2 } from "lucide-react"
import { Status } from "./api/statusApi"
import { useReconnectMutation, useStatusQuery } from "./store/status"

export const ConnectionStatus = () => {
  const { data: readyState } = useStatusQuery()

  const [runReconnectMutation] = useReconnectMutation()

  if (readyState === undefined) {
    return null
  }

  switch (readyState) {
    case Status.CONNECTING:
      return (
        <Alert className="w-fit py-1 px-3 flex-row items-center">
          <Loader2 className="size-4 animate-spin" />
          <AlertDescription>Connecting...</AlertDescription>
        </Alert>
      )

    case Status.OPEN:
      return (
        <Alert className="w-fit py-1 px-3 flex-row items-center border-green-500/50 text-green-600 dark:text-green-400 [&>svg]:text-green-600 dark:[&>svg]:text-green-400">
          <CheckCircle className="size-4" />
          <AlertDescription>Connected</AlertDescription>
        </Alert>
      )

    case Status.CLOSING:
      return (
        <Alert variant="destructive" className="w-fit py-1 px-3 flex-row items-center">
          <AlertTriangle className="size-4" />
          <AlertDescription>Disconnecting...</AlertDescription>
        </Alert>
      )

    case Status.CLOSED:
      return (
        <div className="flex items-center gap-2">
          <Alert variant="destructive" className="w-fit py-1 px-3 flex-row items-center">
            <XCircle className="size-4" />
            <AlertDescription>Disconnected</AlertDescription>
          </Alert>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => runReconnectMutation()}
          >
            Reconnect
          </Button>
        </div>
      )

    default:
      throw new Error("Unknown ReadyState")
  }
}
