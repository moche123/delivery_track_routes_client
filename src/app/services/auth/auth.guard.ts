import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';
import { Auth } from './auth';

export const authGuard: CanActivateFn = () => {
  const auth = inject(Auth);

  if (auth.user() || auth.canRefresh()) {
    return true;
  }

  return false;
};