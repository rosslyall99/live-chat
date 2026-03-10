# Live Chat Architecture

## Overview
This project is Slanj Kilts' live chat CRM system.

It handles:
- customer website chat conversations
- staff inbox and claiming workflow
- admin live monitoring
- notifier integration for incoming chats
- Supabase-backed realtime updates, RLS, RPCs, and Edge Functions

The system is used by store/office staff across multiple sites.

## Core concepts

### Conversations
`conversations` is the main thread/header table.

It stores:
- chat lifecycle state
- assignment state
- eligibility by site
- timestamps such as `last_message_at`
- closure metadata

### Messages
`messages` stores the ordered message stream for each conversation.

Each row belongs to a conversation via `conversation_id`.

### Notifier mirror
`notifier_conversations` is a denormalized mirror used by the notifier and lightweight alert flows.

It is kept in sync from `conversations` and the first customer message via database triggers.

## Main UI areas

### Inbox
`Inbox.jsx` loads conversation headers from `conversations` and splits them into:
- unassigned open chats
- my open chats
- closed chats

### Chat
`Chat.jsx` loads:
- the selected conversation header
- ordered messages for that conversation

It subscribes to realtime changes for:
- new messages
- updates to the current conversation row

Main actions:
- claim conversation via RPC
- send staff reply
- close conversation via RPC

### Admin monitor
`AdminLive.jsx` allows admins to monitor all open chats and intervene directly.

## Database-driven business logic

### Claiming
Claiming is enforced in Postgres via `claim_conversation`.

Rules:
- caller must resolve to a valid staff profile
- conversation must be open
- conversation must be unassigned
- caller site must be in `eligible_sites`

### Closing
Closing is enforced in Postgres via `close_conversation`.

Rules:
- conversation is marked closed
- `assigned_to` is cleared
- closure metadata is stamped
- `handled_by` preserves the final staff owner

### Message sending
Staff replies are inserted into `messages` only when the current user is the assigned owner, unless admin rules apply.

### Triggers
Important triggers/functions:
- sync conversation state into `notifier_conversations`
- copy first customer message into notifier mirror
- touch `conversations.last_message_at` after new messages

## Realtime expectations
Realtime is used for:
- appending new messages live
- refreshing chat state when conversation assignment/status changes
- supporting staff/admin live chat workflows

## Edge Functions
Important edge functions include staff notification flows such as:
- `staff_notify_claimed`
- `staff_notify_closed`

These are invoked from the app after successful DB actions.

## Access control
RLS is central to the design.

General principles:
- staff can see chats relevant to them
- admins can see everything needed for oversight
- write access is narrower than read access
- assignment ownership matters for staff replies

## Known issue to investigate
Potential mismatch:
- staff can see their own closed conversation headers
- but message read policy may block them from loading closed-chat messages once `assigned_to` is cleared

This likely affects non-admin staff opening closed chats they previously handled.

## Practical guidance for AI agents
When analysing bugs or making changes, inspect all of these together:
- React UI code
- Edge Functions
- SQL migration snapshot
- RLS policies
- RPC functions
- triggers related to notifier sync and timestamps

Do not assume business rules are implemented in React only; many are enforced in SQL/RPC/RLS.