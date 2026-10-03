/**
 * Error MEANT for the user of an MCP tool: its message is forwarded verbatim to the host (and from
 * there to the LLM). Any other error is treated as internal and the host only receives a reference
 * (see `ToolRunner`), so the text of these errors must never carry internal data.
 */
export class ToolUserError extends Error {}

/** Tool input validation error (shown with the "Entrada no válida" prefix, i.e. "Invalid input"). */
export class InvalidToolInputError extends ToolUserError {}
