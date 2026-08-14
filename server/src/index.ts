import { buildApp } from "./app.js";

const { httpServer } = buildApp();

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;
httpServer.listen(PORT, () => {
  console.log(`🎨 Whiteboard server listening on http://localhost:${PORT}`);
});
