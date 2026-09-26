import { VideoUploader } from './components/video-uploader';

export default function HomePage() {
  return (
    <main>
      <section className="card">
        <p className="eyebrow">Video Editor Demo</p>
        <h1>AG Go Video Editor Demo</h1>
        <p className="description">Trình chỉnh sửa video trực tuyến</p>
        <VideoUploader />
      </section>
    </main>
  );
}
