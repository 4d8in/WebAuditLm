// Single place that lists every active module. The orchestrator dispatches
// through this registry instead of importing modules ad hoc — adding a
// category means adding one line here, not wiring a new direct call site
// that could bypass the gate.
import type { ActiveModule } from '../modules/active/types.ts';

import { run as accessControl } from '../modules/active/access-control/index.ts';
import { run as authentication } from '../modules/active/authentication/index.ts';
import { run as sqlInjection } from '../modules/active/sql-injection/index.ts';
import { run as xss } from '../modules/active/xss/index.ts';
import { run as csrf } from '../modules/active/csrf/index.ts';
import { run as fileUpload } from '../modules/active/file-upload/index.ts';
import { run as businessLogic } from '../modules/active/business-logic/index.ts';
import { run as informationDisclosure } from '../modules/active/information-disclosure/index.ts';
import { run as pathTraversalCommandInjection } from '../modules/active/path-traversal-command-injection/index.ts';
import { run as ssrfXxe } from '../modules/active/ssrf-xxe/index.ts';
import { run as jwtOauth } from '../modules/active/jwt-oauth/index.ts';
import { run as raceConditions } from '../modules/active/race-conditions/index.ts';

export const ACTIVE_MODULES: Record<string, ActiveModule> = {
  'access-control': accessControl,
  authentication,
  'sql-injection': sqlInjection,
  xss,
  csrf,
  'file-upload': fileUpload,
  'business-logic': businessLogic,
  'information-disclosure': informationDisclosure,
  'path-traversal-command-injection': pathTraversalCommandInjection,
  'ssrf-xxe': ssrfXxe,
  'jwt-oauth': jwtOauth,
  'race-conditions': raceConditions,
};
