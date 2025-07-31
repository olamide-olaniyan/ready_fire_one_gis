# 🗺️ GIS Data Processing - Step by Step Guide

## What We're Doing
We're processing California Fire Hazard Severity Zone shapefiles and loading them into your Supabase database. This will give you a queryable database of fire risk zones across California.

## 📋 Step-by-Step Setup

### Step 1: Set Up Supabase
1. Go to [Supabase](https://supabase.com) and create/login to your account
2. Create a new project or use an existing one
3. Go to **Settings** → **API** in your project dashboard
4. Copy your **Project URL** and **anon/public key**

### Step 2: Update Environment Variables
Edit your `.env` file and replace the placeholder values:
```env
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Step 3: Create the Database Table
1. Go to your Supabase dashboard
2. Click on **SQL Editor**
3. Copy and paste the content from `create-table.sql`
4. Click **Run** to create the table

### Step 4: Test Your Connection
```bash
node test-connection.js
```
You should see: ✅ Supabase connection successful!

### Step 5: Process Your Data
```bash
node process-final.js
```

## 📊 What the Data Contains

Based on inspection, your shapefiles contain:
- **Fire Hazard Zones** with risk levels (Moderate, High, Very High)
- **Geographic boundaries** for each zone
- **State vs Local Responsibility Areas** (SRA vs LRA)
- **Area and perimeter measurements**

## 🔧 Understanding the Code

### Key Files:
- `process-final.js` - Main processor (use this one!)
- `inspect-simple.js` - Inspect data structure
- `test-connection.js` - Test your Supabase connection
- `create-table.sql` - Database schema

### How It Works:
1. **Reads shapefile data** from your `unzipped` folder
2. **Converts geometry** to WKT (Well-Known Text) format
3. **Maps properties** to your database columns
4. **Inserts in batches** to avoid overwhelming the database
5. **Tracks progress** and reports success/failure rates

## 🚀 Processing Your Data

### Full Processing:
```bash
node process-final.js
```
This will process all ~60 folders and thousands of polygons.

### Just Testing:
```bash
node inspect-simple.js
```
This just looks at the data structure without inserting anything.

## 📈 Expected Results

You should see output like:
```
📁 Found 60 folders to process
📂 Processing folder 1/60: alameda_gis_draft
🔄 Processing: c1fhszl06_1.shp from alameda_gis_draft
✅ Processed 1234 features from c1fhszl06_1.shp
📤 Inserting 1234 records to Supabase...
✅ Inserted chunk 1-500 (500/1234)
...
```

## 🔍 Querying Your Data

Once loaded, you can query your data in Supabase:

```sql
-- Count records by hazard class
SELECT haz_class, COUNT(*) 
FROM calfire_zone_risk 
GROUP BY haz_class;

-- Find Very High risk areas
SELECT * 
FROM calfire_zone_risk 
WHERE haz_class = 'Very High' 
LIMIT 10;

-- Count by county/folder
SELECT source_folder, COUNT(*) 
FROM calfire_zone_risk 
GROUP BY source_folder 
ORDER BY COUNT(*) DESC;
```

## ⚠️ Troubleshooting

### "Invalid URL" Error
- Check your `.env` file has real Supabase credentials
- Make sure there are no extra spaces or quotes

### "Permission denied" Error
- Make sure you ran the SQL from `create-table.sql`
- Check that Row Level Security is disabled

### "Too many requests" Error
- The script includes delays between batches
- You can reduce batch size in the code if needed

### Large Dataset Issues
- Processing all data might take 30-60 minutes
- The script processes in chunks to avoid memory issues
- You can stop and restart - it won't duplicate data

## 💡 Next Steps

After loading your data, you might want to:
1. **Enable PostGIS** in Supabase for spatial queries
2. **Create a web app** to visualize the fire zones
3. **Set up APIs** to query risk levels by address
4. **Add real-time fire data** integration

Need help with any of these steps? Let me know!
