import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';

const execFileAsync = promisify(execFile);

/**
 * DWG -> DXF text qua ODA File Converter (env ODA_CONVERTER_PATH trỏ tới ODAFileConverter exe).
 * Cách gọi ODA: ODAFileConverter <inDir> <outDir> <outVer> <outType> <recurse> <audit>
 */
export async function dwgToDxfText(dwgFilePath: string): Promise<string> {
  const exe = process.env.ODA_CONVERTER_PATH;
  if (!exe) {
    throw new Error(
      'ODA_CONVERTER_PATH chưa cấu hình — cài ODA File Converter và đặt biến môi trường này để convert DWG'
    );
  }
  const inDir = path.dirname(dwgFilePath);
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oda-out-'));
  try {
    await execFileAsync(exe, [inDir, outDir, 'ACAD2018', 'DXF', '0', '1'], {
      timeout: 120_000,
      windowsHide: true,
      shell: process.platform === 'win32',
    });
    const base = path.basename(dwgFilePath, path.extname(dwgFilePath));
    const outFile = path.join(outDir, `${base}.dxf`);
    if (!fs.existsSync(outFile)) {
      throw new Error('ODA converter ran but produced no DXF output');
    }
    return fs.readFileSync(outFile, 'utf8');
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
}
