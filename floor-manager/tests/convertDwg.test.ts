import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { dwgToDxfText } from '../server/cad/convertDwg.js';

const FAKE = path.join(import.meta.dirname, 'fixtures', 'fake-oda.cmd');

afterEach(() => {
  delete process.env.ODA_CONVERTER_PATH;
});

describe('dwgToDxfText', () => {
  it('throws a clear error when ODA_CONVERTER_PATH is not set', async () => {
    delete process.env.ODA_CONVERTER_PATH;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dwg-'));
    const dwg = path.join(tmp, 'block.dwg');
    fs.writeFileSync(dwg, 'fake dwg');
    await expect(dwgToDxfText(dwg)).rejects.toThrow(/ODA_CONVERTER_PATH/);
  });

  it('invokes the converter and returns the produced DXF text', async () => {
    process.env.ODA_CONVERTER_PATH = FAKE;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dwg-'));
    const dwg = path.join(tmp, 'block.dwg');
    fs.writeFileSync(dwg, 'fake dwg');
    const text = await dwgToDxfText(dwg);
    expect(text).toContain('LWPOLYLINE');
  });

  it('throws when converter produces no output', async () => {
    // Create a .cmd that exits successfully but produces no DXF file
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dwg-'));
    const noop = path.join(tmp, 'noop.cmd');
    fs.writeFileSync(noop, '@echo off\nrem does nothing\n');
    process.env.ODA_CONVERTER_PATH = noop;
    const dwg = path.join(tmp, 'block.dwg');
    fs.writeFileSync(dwg, 'fake dwg');
    await expect(dwgToDxfText(dwg)).rejects.toThrow(/DXF/i);
  });
});
