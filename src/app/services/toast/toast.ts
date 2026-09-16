

import { Injectable } from '@angular/core';
import { toast } from 'ngx-sonner';

/** Thin wrapper around ngx-sonner's `toast()` — call sites depend on this
 *  service, not the library directly, so the toast implementation can be
 *  swapped later without touching every feature that fires one. */
@Injectable({ providedIn: 'root' })
export class Toast {
  success(message: string): void {
    toast.success(message);
  }

  error(message: string): void {
    toast.error(message);
  }

  info(message: string): void {
    toast.info(message);
  }
}
