import './seed';
import { schedulerTick } from './scheduler';
console.log('Reading Studio scheduler: independent server worker; interval 30 seconds.');
function tick() {
  try {
    console.log(new Date().toISOString(), schedulerTick());
  } catch (e) {
    console.error('Scheduler failure', e);
  }
}
tick();
const timer = setInterval(tick, 30000);
for (const sig of ['SIGINT', 'SIGTERM'] as const)
  process.on(sig, () => {
    clearInterval(timer);
    process.exit(0);
  });
