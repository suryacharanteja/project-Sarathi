import { register } from 'node:module'

register('./node-test-loader.mjs', import.meta.url)
