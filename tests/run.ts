// Execução em um processo: evita interferência do runtime WASM PGlite com o protocolo IPC do node --test.
import './database.test';
import './worker.test';
import './media.test';
import './engine-resilience.test';

import './setup.test';
