import React, { createContext, useContext } from 'react';

export type AgentStudioActions = {
  /** Select node and surface full API settings in the right inspector. */
  openApiInspector: (nodeId: string) => void;
  /** Add a new blank API node and select it. */
  addBlankApiNode: () => void;
  /** Add a new Data List node and select it (same as Data palette → Data List). */
  addDataListNode: () => void;
  /** Add a new Agent node and select it. */
  addAgentNode: () => void;
  /** Add a new Guardrails node and select it. */
  addGuardrailsNode: () => void;
  /** Add a new MCP Server node and select it. */
  addMcpNode: () => void;
  /** Add an If / else node and select it. */
  addIfElseNode: () => void;
  /** Add an End node and select it (workflow output / chat entry). */
  addEndNode: () => void;
};

const Ctx = createContext<AgentStudioActions | null>(null);

export function AgentStudioActionsProvider({
  value,
  children,
}: {
  value: AgentStudioActions;
  children: React.ReactNode;
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAgentStudioActions(): AgentStudioActions | null {
  return useContext(Ctx);
}
