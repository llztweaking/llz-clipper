export interface TranscriptSegment {
  start: number; // segundos
  end: number;
  text: string;
}

export interface TranscriptionService {
  transcribe(wavPath: string, opts?: { language?: string }): Promise<TranscriptSegment[]>;
}

export interface WhisperJsonOutput {
  transcription: Array<{
    offsets: { from: number; to: number }; // milissegundos
    text: string;
  }>;
}
