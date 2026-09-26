import { ApiHealthStatus } from './components/api-health-status';
import { VideoUploader } from './components/video-uploader';

export default function HomePage() {
  return (
    <main>
      <section className="card">
        <p className="eyebrow">Phase 4 — Video Preview</p>
        <h1>AG Go Video Editor Demo</h1>
        <p className="description">Trình chỉnh sửa video trực tuyến</p>
        <ApiHealthStatus />
        <VideoUploader />
      </section>
    </main>
  );
}
