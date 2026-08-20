import { execFile, exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

/** ODAFileConverter là app Qt GUI — trên Linux headless phải có X display, nếu không sẽ abort. */
function findXvfbRun(): string | null {
  if (process.env.ODA_XVFB_RUN) return process.env.ODA_XVFB_RUN;
  for (const p of ['/usr/bin/xvfb-run', '/usr/local/bin/xvfb-run']) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

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

  // ODA identifies files by extension — create a clean input dir with a .dwg file.
  // This also handles multer temp files which are saved without an extension.
  const inDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oda-in-'));
  fs.copyFileSync(dwgFilePath, path.join(inDir, 'input.dwg'));

  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oda-out-'));
  const odaArgs = [inDir, outDir, 'ACAD2018', 'DXF', '0', '1'];
  try {
    if (process.platform === 'win32') {
      // Use exec (shell mode) to support paths with spaces and .cmd test fixtures.
      // cmd.exe strips outermost quotes from /c "...", leaving: "exe" "inDir" "outDir" ...
      const cmdLine = [`"${exe}"`, `"${inDir}"`, `"${outDir}"`, 'ACAD2018', 'DXF', '0', '1'].join(' ');
      await execAsync(cmdLine, { timeout: 120_000, windowsHide: true });
    } else {
      // Qt cần HOME ghi được để lưu settings; ODA cũng đọc config từ đó.
      const env = {
        ...process.env,
        HOME: process.env.HOME || os.tmpdir(),
        QT_QPA_PLATFORM: process.env.QT_QPA_PLATFORM || 'xcb',
      };
      const xvfbRun = findXvfbRun();
      if (xvfbRun) {
        // -a: tự chọn display number còn trống (an toàn khi chạy song song nhiều job)
        await execFileAsync(
          xvfbRun,
          ['-a', '--server-args=-screen 0 1280x1024x24 -nolisten tcp', exe, ...odaArgs],
          { timeout: 120_000, env }
        );
      } else if (process.env.DISPLAY) {
        await execFileAsync(exe, odaArgs, { timeout: 120_000, env });
      } else {
        throw new Error(
          'ODAFileConverter cần X display nhưng không tìm thấy xvfb-run và cũng không có $DISPLAY. ' +
            'Cài gói xorg-x11-server-Xvfb (AlmaLinux/RHEL) hoặc xvfb (Debian/Ubuntu).'
        );
      }
    }
    const outFile = path.join(outDir, 'input.dxf');
    if (!fs.existsSync(outFile)) {
      throw new Error('ODA converter ran but produced no DXF output');
    }
    return fs.readFileSync(outFile, 'utf8');
  } finally {
    fs.rmSync(inDir, { recursive: true, force: true });
    fs.rmSync(outDir, { recursive: true, force: true });
  }
}
