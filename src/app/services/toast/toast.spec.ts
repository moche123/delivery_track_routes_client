import { TestBed } from '@angular/core/testing';
import { toast } from 'ngx-sonner';
import { vi } from 'vitest';
import { Toast } from './toast';

describe('Toast', () => {
  let service: Toast;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Toast);
    vi.spyOn(toast, 'success');
    vi.spyOn(toast, 'error');
    vi.spyOn(toast, 'info');
  });

  it('should delegate to ngx-sonner', () => {
    service.success('ok');
    service.error('fail');
    service.info('hey');

    expect(toast.success).toHaveBeenCalledWith('ok');
    expect(toast.error).toHaveBeenCalledWith('fail');
    expect(toast.info).toHaveBeenCalledWith('hey');
  });
});
