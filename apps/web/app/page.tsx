import { ApiHealthStatus } from './components/api-health-status';

export default function HomePage() {
  return (
    <main>
      <section className="card">
        <p className="eyebrow">Phase 1 — Project Bootstrap</p>
        <h1>AG Go Video Editor Demo</h1>
        <p className="description">Trình chỉnh sửa video trực tuyến</p>
        <ApiHealthStatus />
      </section>
    </main>
  );
}
