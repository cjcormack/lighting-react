import {Avatar, ListItem, ListItemAvatar, ListItemText} from "@mui/material";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import React from "react";

export default function TrackStatus() {
  return (
      <ListItem>
        <ListItemAvatar>
          <Avatar>
            <PlayArrowIcon />
          </Avatar>
        </ListItemAvatar>
        <ListItemText primary="Jump" secondary="Van Halen" />
      </ListItem>
  )
}
