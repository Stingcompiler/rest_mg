/**
 * Where a sign-in lands.
 *
 * The `?next` on the login page is set by whoever was bounced there last, and
 * that is frequently a different person on a shared terminal. These pin that a
 * stale `next` never carries someone into an app that is not theirs, and that
 * the parameter cannot be used as an open redirect.
 */
import { describe, expect, it } from 'vitest';

import { destinationAfterLogin, homeForRole } from '../http';

describe('homeForRole', () => {
  it('sends each role to its own app', () => {
    expect(homeForRole('owner')).toBe('/manager/');
    expect(homeForRole('manager')).toBe('/manager/');
    expect(homeForRole('cashier')).toBe('/pos/');
    expect(homeForRole('kitchen')).toBe('/kitchen/');
  });
});

describe('destinationAfterLogin', () => {
  it('uses the role home when there is no next', () => {
    expect(destinationAfterLogin(null, 'manager')).toBe('/manager/');
    expect(destinationAfterLogin('', 'cashier')).toBe('/pos/');
  });

  it("ignores a next left behind by someone else's session", () => {
    // The reported bug: a cook signs out of /kitchen, leaving next=/kitchen/,
    // and the manager who signs in next is carried to the kitchen board.
    expect(destinationAfterLogin('/kitchen/', 'manager')).toBe('/manager/');
    expect(destinationAfterLogin('/manager/', 'kitchen')).toBe('/kitchen/');
    expect(destinationAfterLogin('/pos/', 'kitchen')).toBe('/kitchen/');
  });

  it('honours a deep link the person is entitled to', () => {
    expect(destinationAfterLogin('/manager/staff/', 'manager')).toBe('/manager/staff/');
    expect(destinationAfterLogin('/manager/devices/', 'owner')).toBe('/manager/devices/');
    expect(destinationAfterLogin('/pos/payment/', 'cashier')).toBe('/pos/payment/');
  });

  it('refuses anything that could redirect off-site', () => {
    expect(destinationAfterLogin('//evil.example', 'manager')).toBe('/manager/');
    expect(destinationAfterLogin('https://evil.example', 'manager')).toBe('/manager/');
    expect(destinationAfterLogin('javascript:alert(1)', 'manager')).toBe('/manager/');
    // A path-looking string that is not absolute is not a route either.
    expect(destinationAfterLogin('manager/staff', 'manager')).toBe('/manager/');
  });
});
