import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

async function testSupabaseConnection() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        console.error('❌ Missing Supabase credentials in .env file');
        console.log('Please add:');
        console.log('SUPABASE_URL=your_supabase_project_url');
        console.log('SUPABASE_KEY=your_supabase_anon_key');
        return;
    }

    try {
        const supabase = createClient(supabaseUrl, supabaseKey);

        // Test connection by checking the table
        const { data, error } = await supabase
            .from('calfire_zone_risk_duplicate')
            .select('*')
            .limit(1);

        if (error) {
            console.error('❌ Supabase connection failed:', error.message);
            console.log('Make sure:');
            console.log('1. Your table "calfire_zone_risk_duplicate" exists');
            console.log('2. Your Supabase URL and key are correct');
            console.log('3. Row Level Security (RLS) allows inserts');
        } else {
            console.log('✅ Supabase connection successful!');
            console.log(`📊 Current records in table: ${data?.length || 0}`);
        }
    } catch (error) {
        console.error('❌ Connection error:', error.message);
    }
}

testSupabaseConnection();
