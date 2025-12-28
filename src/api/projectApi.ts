import { InternalApiConnection } from "./internalApi";
import { Subscription } from "./subscription";

// Project summary for list views
export interface ProjectSummary {
  id: number;
  name: string;
  description: string | null;
  isCurrent: boolean;
}

// Full project details for editing/viewing
export interface ProjectDetail {
  id: number;
  name: string;
  description: string | null;
  isCurrent: boolean;
  loadFixturesScriptId: number | null;
  loadFixturesScriptName: string | null;
  initialSceneId: number | null;
  initialSceneName: string | null;
  trackChangedScriptId: number | null;
  trackChangedScriptName: string | null;
  runLoopScriptId: number | null;
  runLoopScriptName: string | null;
  runLoopDelayMs: number | null;
  scriptCount: number;
  sceneCount: number;
}

// For creating a new project
export interface CreateProjectRequest {
  name: string;
  description?: string;
}

// For updating a project
export interface UpdateProjectRequest {
  name?: string;
  description?: string | null;
  loadFixturesScriptId?: number | null;
  initialSceneId?: number | null;
  trackChangedScriptId?: number | null;
  runLoopScriptId?: number | null;
  runLoopDelayMs?: number | null;
}

// Script summary for project config dropdowns
export interface ProjectScript {
  id: number;
  name: string;
  settingsCount: number;
}

// Scene summary for project config dropdowns
export interface ProjectScene {
  id: number;
  name: string;
  mode: 'SCENE' | 'CHASE';
  scriptName: string;
}

// Full script details from another project (read-only)
export interface ProjectScriptDetail {
  id: number;
  name: string;
  script: string;
  settings: Array<{
    type: string;
    name: string;
    minValue?: number;
    maxValue?: number;
    defaultValue?: number;
  }>;
}

// Response from create initial scene endpoint
export interface CreateInitialSceneResponse {
  scriptId: number;
  scriptName: string;
  sceneId: number;
  sceneName: string;
  message: string;
}

// Response from create script endpoints (track changed, run loop)
export interface CreateScriptResponse {
  scriptId: number;
  scriptName: string;
  message: string;
}

// WebSocket message types
type ProjectStateMessage = {
  type: 'projectState';
  projectId: number;
  projectName: string;
  description: string | null;
}

type ProjectChangedMessage = {
  type: 'projectChanged';
  previousProjectId: number;
  newProjectId: number;
  newProjectName: string;
}

type ProjectInMessage = ProjectStateMessage | ProjectChangedMessage;

export interface ProjectApi {
  subscribe(fn: (state: ProjectStateMessage) => void): Subscription;
  subscribeToSwitch(fn: (data: ProjectChangedMessage) => void): Subscription;
  requestState(): void;
}

export function createProjectApi(conn: InternalApiConnection): ProjectApi {
  let nextSubscriptionId = 1;
  const stateSubscriptions = new Map<number, (state: ProjectStateMessage) => void>();
  const switchSubscriptions = new Map<number, (data: ProjectChangedMessage) => void>();

  const notifyState = (state: ProjectStateMessage) => {
    stateSubscriptions.forEach((fn) => fn(state));
  };

  const notifySwitch = (data: ProjectChangedMessage) => {
    switchSubscriptions.forEach((fn) => fn(data));
  };

  const handleOnOpen = () => {
    // Request current project state when connection opens
    conn.send(JSON.stringify({ type: "projectState" }));
  };

  const handleOnMessage = (ev: MessageEvent) => {
    const message: ProjectInMessage = JSON.parse(ev.data);

    if (message == null) {
      return;
    }

    if (message.type === 'projectState') {
      notifyState(message);
    } else if (message.type === 'projectChanged') {
      notifySwitch(message);
      // Also notify state subscribers with new state
      notifyState({
        type: 'projectState',
        projectId: message.newProjectId,
        projectName: message.newProjectName,
        description: null,
      });
    }
  };

  conn.subscribe((evType, ev) => {
    if (evType === 'open') {
      handleOnOpen();
    } else if (evType === 'message' && ev instanceof MessageEvent) {
      handleOnMessage(ev);
    }
  });

  return {
    subscribe(fn: (state: ProjectStateMessage) => void): Subscription {
      const thisId = nextSubscriptionId;
      nextSubscriptionId++;

      stateSubscriptions.set(thisId, fn);

      return {
        unsubscribe: () => {
          stateSubscriptions.delete(thisId);
        },
      };
    },

    subscribeToSwitch(fn: (data: ProjectChangedMessage) => void): Subscription {
      const thisId = nextSubscriptionId;
      nextSubscriptionId++;

      switchSubscriptions.set(thisId, fn);

      return {
        unsubscribe: () => {
          switchSubscriptions.delete(thisId);
        },
      };
    },

    requestState(): void {
      conn.send(JSON.stringify({ type: "projectState" }));
    },
  };
}
