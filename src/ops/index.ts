import type { Operation } from '../core/registry.js';
import { approvalOperations } from './approval.js';
import { attendanceOperations } from './attendance.js';
import { authOperations } from './auth.js';
import { boardOperations } from './board.js';
import { calendarOperations } from './calendar.js';
import { configOperations } from './config.js';
import { mailOperations } from './mail.js';
import { orgOperations } from './org.js';

/**
 * The whole surface of this tool.
 *
 * Adding a feature means writing one operation module and listing it here;
 * the CLI commands and the MCP tools are generated from these definitions.
 */
export const OPERATIONS: Operation[] = [
  ...configOperations,
  ...authOperations,
  ...attendanceOperations,
  ...mailOperations,
  ...calendarOperations,
  ...approvalOperations,
  ...boardOperations,
  ...orgOperations,
] as Operation[];
