import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spokenPlace } from '../src/services/ivr.service.js';

test('full address becomes area and city', () => {
  assert.equal(spokenPlace('12/3, 2nd Street, Anna Nagar, Chennai, Tamil Nadu 600040, India'), 'Anna Nagar, Chennai');
});

test('plus codes are dropped', () => {
  assert.equal(spokenPlace('8G7P+2F, Anna Nagar, Chennai, Tamil Nadu 600040, India'), 'Anna Nagar, Chennai');
  assert.equal(spokenPlace('8G7P+2F Sivakasi, Tamil Nadu, India'), 'Sivakasi, Tamil Nadu');
});

test('short place names stay as they are', () => {
  assert.equal(spokenPlace('Sivakasi, Tamil Nadu'), 'Sivakasi, Tamil Nadu');
  assert.equal(spokenPlace('Chennai'), 'Chennai');
});

test('nothing is spoken without a real place name', () => {
  assert.equal(spokenPlace('GPS 13.08270, 80.27070'), '');
  assert.equal(spokenPlace('13.0827, 80.2707'), '');
  assert.equal(spokenPlace('https://maps.google.com/?q=13.0827,80.2707'), '');
  assert.equal(spokenPlace('Location not yet available'), '');
  assert.equal(spokenPlace('Location disabled on device'), '');
  assert.equal(spokenPlace(''), '');
  assert.equal(spokenPlace(undefined), '');
});
