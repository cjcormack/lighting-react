import { restApi } from './restApi'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AiChatRequest {
  conversationId?: number | null
  message: string
}

export interface AiAction {
  tool: string
  description: string
  success: boolean
}

export interface AiChatResponse {
  conversationId: number
  message: string
  actions: AiAction[]
}

export interface AiConversationSummary {
  id: number
  title: string | null
  updatedAt: number
}

export interface DisplayToolCall {
  tool: string
}

export interface DisplayMessage {
  role: string
  content: string
  toolCalls?: DisplayToolCall[] | null
}

export interface AiConversationDetail {
  id: number
  title: string | null
  messages: DisplayMessage[]
  updatedAt: number
}

// ─── API Endpoints ──────────────────────────────────────────────────────────

export const aiApi = restApi.injectEndpoints({
  endpoints: (build) => ({
    aiChat: build.mutation<AiChatResponse, AiChatRequest>({
      query: (body) => ({
        url: 'ai/chat',
        method: 'POST',
        body,
      }),
      // AI actions may create presets, change effects, etc.
      invalidatesTags: [
        'FxPreset',
        'GroupActiveEffects',
        'FixtureEffects',
        'AiConversation',
      ],
    }),

    aiConversations: build.query<AiConversationSummary[], void>({
      query: () => 'ai/conversations',
      providesTags: ['AiConversation'],
    }),

    aiConversation: build.query<AiConversationDetail, number>({
      query: (id) => `ai/conversations/${id}`,
      providesTags: (_result, _error, id) => [
        { type: 'AiConversation', id },
      ],
    }),

    deleteAiConversation: build.mutation<void, number>({
      query: (id) => ({
        url: `ai/conversations/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['AiConversation'],
    }),
  }),
  overrideExisting: false,
})

export const {
  useAiChatMutation,
  useAiConversationsQuery,
  useAiConversationQuery,
  useDeleteAiConversationMutation,
} = aiApi
