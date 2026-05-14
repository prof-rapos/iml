const RUNNER_URL = import.meta.env.VITE_JAVA_RUNNER_URL || 'https://iml-java-runner.fly.dev';

// Sends files to the runner and returns { stdout, stderr, exitCode, phase, error }
export async function runJava(files, mainClass) {
  try {
    const res = await fetch(`${RUNNER_URL}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files, mainClass }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { stdout: '', stderr: body.error || `Server error ${res.status}`, exitCode: 1, phase: 'http' };
    }
    return await res.json();
  } catch (err) {
    return { stdout: '', stderr: err.message, exitCode: 1, phase: 'network' };
  }
}

export async function checkRunner() {
  try {
    const res = await fetch(`${RUNNER_URL}/health`, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}
