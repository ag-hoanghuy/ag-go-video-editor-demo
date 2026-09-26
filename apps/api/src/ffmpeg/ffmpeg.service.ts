import { Injectable } from '@nestjs/common';
import { spawn } from 'node:child_process';

interface ProcessResult {
  stdout: string;
}

interface TrimVideoOptions {
  inputPath: string;
  outputPath: string;
  start: number;
  end: number;
}

const maximumProcessOutputLength = 64 * 1024;

function appendProcessOutput(currentOutput: string, chunk: Buffer): string {
  return `${currentOutput}${chunk.toString('utf8')}`.slice(-maximumProcessOutputLength);
}

function formatSeconds(value: number): string {
  return value.toFixed(6).replace(/\.?0+$/, '');
}

@Injectable()
export class FfmpegService {
  async probeDuration(inputPath: string): Promise<number> {
    const result = await this.runProcess('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      inputPath,
    ]);
    const duration = Number(result.stdout.trim());

    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error('ffprobe không trả về thời lượng video hợp lệ.');
    }

    return duration;
  }

  async trimVideo(options: TrimVideoOptions): Promise<void> {
    const selectedDuration = options.end - options.start;

    await this.runProcess('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-i',
      options.inputPath,
      '-ss',
      formatSeconds(options.start),
      '-t',
      formatSeconds(selectedDuration),
      '-map',
      '0:v:0',
      '-map',
      '0:a:0?',
      '-map_metadata',
      '-1',
      '-map_chapters',
      '-1',
      '-c:v',
      'libx264',
      '-preset',
      'medium',
      '-crf',
      '23',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-movflags',
      '+faststart',
      options.outputPath,
    ]);
  }

  private runProcess(executable: string, arguments_: string[]): Promise<ProcessResult> {
    return new Promise((resolve, reject) => {
      const childProcess = spawn(executable, arguments_, {
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';

      childProcess.stdout.on('data', (chunk: Buffer) => {
        stdout = appendProcessOutput(stdout, chunk);
      });
      childProcess.stderr.on('data', (chunk: Buffer) => {
        stderr = appendProcessOutput(stderr, chunk);
      });
      childProcess.once('error', () => {
        reject(new Error(`Không thể khởi chạy ${executable}.`));
      });
      childProcess.once('close', (exitCode) => {
        if (exitCode === 0) {
          resolve({ stdout });
          return;
        }

        const detail = stderr.trim() || `exit code ${exitCode ?? 'unknown'}`;
        reject(new Error(`${executable} xử lý thất bại: ${detail}`));
      });
    });
  }
}
