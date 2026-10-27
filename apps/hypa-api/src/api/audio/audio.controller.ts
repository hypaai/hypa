import {
  Controller,
  Get,
  Param,
  Res,
  NotFoundException,
  Header,
} from '@nestjs/common';
import type { Response } from 'express';
import { AudioStorageService } from 'src/libs/shared/audio-storage.service';

@Controller('audio')
export class AudioController {
  constructor(private readonly audioStorage: AudioStorageService) {}

  @Get(':id')
  @Header('Accept-Ranges', 'bytes')
  @Header('Cache-Control', 'public, max-age=3600')
  async streamAudio(@Param('id') id: string, @Res() res: Response) {
    const metadata = await this.audioStorage.getMetadata(id);
    if (!metadata) {
      throw new NotFoundException('Audio file not found');
    }

    const fileSize = metadata.size;

    res.setHeader('Content-Type', metadata.mimeType);
    res.setHeader('Content-Length', fileSize.toString());

    const range = res.req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = end - start + 1;

      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Length', chunksize.toString());

      const stream = this.audioStorage.createReadStream(id, { start, end });
      stream.pipe(res);
    } else {
      const stream = this.audioStorage.createReadStream(id);
      stream.pipe(res);
    }
  }
}
