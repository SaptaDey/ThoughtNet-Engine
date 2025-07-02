
import { createApp } from './app';
import { settings } from './config';

const app = createApp();
const { host, port } = settings.app;

app.listen(port, host, () => {
  console.log(`Server is running on http://${host}:${port}`);
});
