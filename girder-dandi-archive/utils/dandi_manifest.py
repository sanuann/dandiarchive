import girder_client
import os




dandiset_identifier = '000023'
api_url='https://girder.dandiarchive.org/api/v1'
gc = girder_client.GirderClient(apiUrl=api_url)
API_KEY= os.getenv('DANDI_API_KEY')
gc.authenticate(apiKey=API_KEY)

def create_dandiset_manifest(parent_folder_id):
    names_md5s_urls = []
    subjects = gc.listFolder(parent_folder_id)
    for ind, subject in enumerate(subjects):
        nwbs = gc.listItem(subject['_id'])
        for nwb in nwbs:
            download_url = f"https://girder.dandiarchive.org/api/v1/item/{nwb['_id']}/download"
            if 'md5' in nwb['meta']:
                md5 = nwb['meta']['md5'] 
            else:
                md5 = ''
            names_md5s_urls.append((nwb['name'], md5, download_url))
    return names_md5s_urls 

dandiset_folder_id = gc.getResource(f"dandi/{dandiset_identifier}")['_id']
names_md5s_urls = create_dandiset_manifest(dandiset_folder_id)
with open(f"dandiset_{dandiset_identifier}_manifest.csv", 'w') as manifest:
    manifest.write('name,md5,download_url\n')
    manifest.write('\n'.join(','.join(line) for line in names_md5s_urls))
