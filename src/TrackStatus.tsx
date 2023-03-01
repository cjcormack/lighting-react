import {Avatar, ListItem, ListItemAvatar, ListItemText} from "@mui/material";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PauseIcon from "@mui/icons-material/Pause";
import React from "react";
import {atom, useRecoilValue} from "recoil";
import {syncEffect} from "recoil-sync";
import {LightingTrackStoreKey} from "./connection";
import {TrackDetails, TrackDetailsChecker} from "./api/trackApi";

const trackState = atom<TrackDetails>({
  key: 'channels',
  default: {
    isPlaying: false,
    artist: '',
    name: '',
  },
  effects: [
    syncEffect({
      itemKey: 'currentTrack',
      storeKey: LightingTrackStoreKey,
      refine: TrackDetailsChecker,
    }),
  ],
})

export default function TrackStatus() {
  const currentTrack = useRecoilValue(trackState)
  return (
      <ListItem>
        <ListItemAvatar>
          <Avatar>
            {currentTrack.isPlaying ? <PlayArrowIcon/> : <PauseIcon/>}
          </Avatar>
        </ListItemAvatar>
        <ListItemText primary={currentTrack.name} secondary={currentTrack.artist}/>
      </ListItem>
  )
}
