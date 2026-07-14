import '@testing-library/jest-dom';
import { beforeAll, afterEach, afterAll } from 'vitest';

// Mock scrollIntoView since jsdom doesn't implement it
Element.prototype.scrollIntoView = () => {};
