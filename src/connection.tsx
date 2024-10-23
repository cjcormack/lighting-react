import React from "react"
import { Alert, Button } from "@mui/material"
import { Status } from "./api/statusApi"
import { useReconnectMutation, useStatusQuery } from "./store/status"

export const ConnectionStatus = (() => {
  const {
    data: readyState,
  } = useStatusQuery()

  const [
    runReconnectMutation,
  ] = useReconnectMutation()

  if (readyState === undefined) {
    return null
  }

  switch (readyState) {
    case Status.CONNECTING:
      return <Alert severity="warning">Connecting...</Alert>

    case Status.OPEN:
      return <Alert severity="success">Connected</Alert>

    case Status.CLOSING:
      return <Alert severity="error">Disconnecting...</Alert>

    case Status.CLOSED:
      return <>
        <Alert severity="error">Disconnected</Alert>
        <Button variant="contained" color="error" onClick={() => runReconnectMutation()}>Reconnect...</Button>
      </>

    default:
      throw new Error("Unknown ReadyState")
  }
})
