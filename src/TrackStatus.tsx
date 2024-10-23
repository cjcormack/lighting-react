import {Avatar, ListItem, ListItemAvatar, ListItemText} from "@mui/material";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PauseIcon from "@mui/icons-material/Pause";
import React from "react";
import { useCurrentTrackQuery } from "./store/tracks"

export default function TrackStatus() {
  const {
    data: currentTrack,
  } = useCurrentTrackQuery()

  return (
      <ListItem>
        <ListItemAvatar>
          <Avatar>
            {currentTrack?.isPlaying ? <PlayArrowIcon/> : <PauseIcon/>}
          </Avatar>
        </ListItemAvatar>
        <ListItemText primary={currentTrack?.name} secondary={currentTrack?.artist}/>
      </ListItem>
  )
}
