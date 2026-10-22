import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'tests/ui',use:{baseURL:'http://127.0.0.1:5173',headless:true},webServer:{command:'npm run dev',url:'http://127.0.0.1:5173',reuseExistingServer:false,env:{VITE_SUPABASE_URL:'http://127.0.0.1:54321',VITE_SUPABASE_PUBLISHABLE_KEY:'test-public-key'}},reporter:'list',workers:1});
