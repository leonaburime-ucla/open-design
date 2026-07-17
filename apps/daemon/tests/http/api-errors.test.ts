import { describe, expect, it, vi } from 'vitest';
import {
  createCompatApiError,
  createCompatApiErrorResponse,
  sendCompatApiError,
} from '../../src/http/index.js';

function makeRes() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
}

describe('createCompatApiError', () => {
  it('builds an ApiError from code + message with no extra init', () => {
    expect(createCompatApiError('NOT_FOUND', 'project not found')).toEqual({
      code: 'NOT_FOUND',
      message: 'project not found',
    });
  });

  it('merges an explicit init object onto the error', () => {
    expect(
      createCompatApiError('VALIDATION_FAILED', 'bad input', {
        details: { kind: 'validation', issues: [] } as any,
      }),
    ).toEqual({
      code: 'VALIDATION_FAILED',
      message: 'bad input',
      details: { kind: 'validation', issues: [] },
    });
  });
});

describe('createCompatApiErrorResponse', () => {
  it('wraps the built error in the standard { error } envelope', () => {
    expect(createCompatApiErrorResponse('BAD_REQUEST', 'nope')).toEqual({
      error: { code: 'BAD_REQUEST', message: 'nope' },
    });
  });
});

describe('sendCompatApiError', () => {
  it('writes the status and the wrapped error built from separate arguments', () => {
    const res = makeRes();
    sendCompatApiError(res as any, 404, 'PROJECT_NOT_FOUND', 'project not found');
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'PROJECT_NOT_FOUND', message: 'project not found' },
    });
  });

  it('passes an explicit init object through to the sent error', () => {
    const res = makeRes();
    sendCompatApiError(res as any, 422, 'VALIDATION_FAILED', 'bad input', {
      details: { kind: 'validation', issues: [{ path: 'name', message: 'required' }] } as any,
    });
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'bad input',
        details: { kind: 'validation', issues: [{ path: 'name', message: 'required' }] },
      },
    });
  });
});
