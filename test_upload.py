import requests
import sys
import json

BASE_URL = "http://localhost:8080/api/v1"

def login():
    # Login user/password (assuming default test user user/password or admin/admin)
    # Actually I should register a new user to be sure
    reg_data = {
        "username": "testuser_upload",
        "email": "test_upload@example.com",
        "password": "Password123!"
    }
    
    try:
        r = requests.post(f"{BASE_URL}/auth/register", json=reg_data)
        if r.status_code == 201:
            print("Registered user")
        else:
            print(f"Register status: {r.status_code} (User might exist)")
            
        auth_data = {
            "username": "testuser_upload",
            "password": "Password123!"
        }
        r = requests.post(f"{BASE_URL}/auth/login", json=auth_data)
        if r.status_code != 200:
            print(f"Login failed: {r.text}")
            return None
            
        token = r.json()['data']['access_token']
        print(f"Got token: {token[:10]}...")
        return token
    except Exception as e:
        print(f"Auth error: {e}")
        return None

def create_folder(token):
    headers = {'Authorization': f'Bearer {token}'}
    data = {"folder_name": "Test Upload Folder"}
    r = requests.post(f"{BASE_URL}/folders", json=data, headers=headers)
    if r.status_code == 201:
        folder_id = r.json()['data']['folder_id']
        print(f"Created folder ID: {folder_id}")
        return folder_id
    elif r.status_code == 200: # Maybe list folders?
        pass
    print(f"Create folder failed: {r.text}")
    return 1 # Fallback to 1

def upload_test(token, folder_id):
    # Step 1: Request Presigned URL
    req_url = f"{BASE_URL}/folders/{folder_id}/images/request-upload"
    data = {"filename": "test_script.png", "content_type": "image/png", "file_size": 1024}
    headers = {'Authorization': f'Bearer {token}'}
    
    print(f"Requesting URL from {req_url}")
    r = requests.post(req_url, json=data, headers=headers)
    if r.status_code != 200:
        print(f"Request URL failed: {r.text}")
        return

    resp_data = r.json()['data']
    presigned_url = resp_data['presigned_url']
    upload_token = resp_data['upload_token']
    print(f"Got URL: {presigned_url}")

    # Step 2: Upload to S3
    print("Uploading to MinIO...")
    # Generate fake png content
    content = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89' * 10
    
    try:
        # Note: Do not send Authorization header to S3
        s3_r = requests.put(presigned_url, data=content, headers={'Content-Type': 'image/png'})
        print(f"S3 Status: {s3_r.status_code}")
        if s3_r.status_code != 200:
            print(f"S3 Error: {s3_r.text}")
            return
    except Exception as e:
        print(f"S3 Network Error: {e}")
        return

    # Step 3: Confirm
    confirm_url = f"{BASE_URL}/folders/{folder_id}/images/confirm-upload"
    confirm_data = {
        "upload_token": upload_token,
        "filename": "test_script.png",
        "content_type": "image/png",
        "file_size": len(content)
    }
    print(f"Confirming upload...")
    r = requests.post(confirm_url, json=confirm_data, headers=headers)
    print(f"Confirm Status: {r.status_code}")
    print(f"Result: {r.text}")

if __name__ == "__main__":
    token = login()
    if token:
        folder_id = create_folder(token)
        upload_test(token, folder_id)
