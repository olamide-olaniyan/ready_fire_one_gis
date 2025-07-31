import os
import geopandas as gpd
from shapely.validation import make_valid
from supabase import create_client

url = os.getenv('SUPABASE_URL')
key = os.getenv('SUPABASE_KEY')
supabase = create_client(url, key)

def process_shapefiles(base_path, output_path, chunk_size=1000):
    folders = [f for f in os.listdir(base_path)]
    for folder_index, folder in enumerate(folders):
        folder_path = os.path.join(base_path, folder)
        shp_files = [file for file in os.listdir(folder_path) if file.endswith('.shp')]
        for file_index, file in enumerate(shp_files):
            shp_file = os.path.join(folder_path, file)

            try:
                gdf = gpd.read_file(shp_file).to_crs(epsg=4326)

                gdf['geometry'] = gdf.geometry.apply(make_valid)
                gdf['geometry'] = gdf.geometry.buffer(0)
                gdf = gdf[~gdf.is_empty & gdf.is_valid]

                gdf['geometry'] = gdf.geometry.to_wkt()
                gdf.columns = [col.lower() for col in gdf.columns]

                output_file = os.path.join(output_path, f"{folder}_clean.csv")
                gdf.to_csv(output_file, index=False)

                records = gdf.to_dict(orient='records')

                for i in range(0, len(records), chunk_size):
                    chunk = records[i:i+chunk_size]
                    response = supabase.table('calfire_zone_risk').insert(chunk).execute()

                    if response.data:
                        print(f"✅ Inserted chunk {i}-{i+len(chunk)-1} successfully for file {file_index} in folder {folder_index} ({folder}).")
                    else:
                        print(f"❌ Error in chunk {i}-{i+len(chunk)-1} for file {file_index} in folder {folder_index} ({folder}): {response.error}")
            except Exception as e:
                print(f"🚨 Exception processing file {file_index} in folder {folder_index} ({folder}): {str(e)}")

# Example usage
base_path = './unzipped'
output_path = './fire_hazard_zones'
process_shapefiles(base_path, output_path, chunk_size=1000)

def inspect_shapefile_data(base_path):
    """Inspect the data structure and values before insertion"""
    for folder in os.listdir(base_path):
        if "recommended" in folder:
            folder_path = os.path.join(base_path, folder)
            for file in os.listdir(folder_path):
                if file.endswith('.shp'):
                    shp_file = os.path.join(folder_path, file)
                    
                    # Read and process the shapefile
                    gdf = gpd.read_file(shp_file)
                    gdf = gdf.to_crs(epsg=4326)
                    
                    # Apply the same transformations
                    gdf['geometry'] = gdf['geometry'].apply(lambda geom: make_valid(geom))
                    gdf['geometry'] = gdf['geometry'].buffer(0)
                    gdf = gdf[~gdf.is_empty & gdf.is_valid]
                    gdf['geometry'] = gdf['geometry'].apply(lambda geom: geom.wkt)
                    gdf.columns = [col.lower() for col in gdf.columns]
                    
                    # Print column info
                    print(f"\n📁 File: {file}")
                    print(f"Columns: {list(gdf.columns)}")
                    print(f"\nData types:")
                    print(gdf.dtypes)
                    print(f"\nFirst row sample:")
                    if len(gdf) > 0:
                        print(gdf.iloc[0].to_dict())
                    
                    # Look for columns that might contain "Very High"
                    for col in gdf.columns:
                        unique_vals = gdf[col].dropna().unique()
                        if any("High" in str(val) for val in unique_vals):
                            print(f"\n⚠️ Column '{col}' contains values like: {unique_vals[:5]}")
                    
                    return gdf  # Return first one for further inspection

# Run inspection
sample_gdf = inspect_shapefile_data(base_path)
