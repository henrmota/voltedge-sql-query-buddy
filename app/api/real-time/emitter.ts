import EventEmitter from "node:events";

// Use global object to ensure singleton across all module imports
// This is critical for Next.js serverless/edge environments where
// modules can be imported in different contexts
declare global {
  var _eventEmitter: EventEmitter | undefined;
}

// Initialize singleton EventEmitter
if (!global._eventEmitter) {
  global._eventEmitter = new EventEmitter();
  // Set max listeners to prevent memory leaks warnings
  global._eventEmitter.setMaxListeners(100);
}

const eventEmitter = global._eventEmitter;

export default eventEmitter;
