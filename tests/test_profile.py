import base64
import io

import pytest
from PIL import Image

from app.extensions import db
from app.models import AccountSettings, User


@pytest.mark.parametrize('role', ['student', 'admin', 'counselor', 'head', 'staff'])
def test_settings_available_to_all_roles(client, auth, role):
    headers = auth(role)
    assert client.get('/api/v1/account-settings', headers=headers).json['settings']['display_name'] == ''
    response = client.patch('/api/v1/account-settings', headers=headers, json={'display_name':'New name', 'bio':'A short introduction.'})
    assert response.status_code == 200
    assert client.get('/api/v1/account-settings', headers=headers).json['settings']['display_name'] == 'New name'
    other = client.get('/api/v1/account-settings', headers=auth('student2'))
    assert other.json['settings']['display_name'] == ''


def test_profile_validation_and_isolation(client, auth):
    headers = auth('student')
    assert client.get('/api/v1/account-settings').status_code == 401
    assert client.patch('/api/v1/account-settings', headers=headers, json={'role':'admin'}).status_code == 400
    assert client.patch('/api/v1/account-settings', headers=headers, json={'bio':'x' * 501}).status_code == 400
    assert client.patch('/api/v1/account-settings', headers=headers, json={'display_name':[]}).status_code == 400
    for value in [True, 2.5, 9, 0]:
        assert client.patch('/api/v1/profile', headers=headers, json={'year_level':value}).status_code == 400
    result = client.patch('/api/v1/profile', headers=headers, json={'first_name':'Updated', 'role':'admin'})
    assert result.status_code == 200
    assert client.get('/api/v1/auth/me', headers=headers).json['user']['role'] == 'student'
    assert client.get('/api/v1/auth/me', headers=auth('student2')).json['profile']['first_name'] == 'Student2'


def test_photo_validation_storage_removal(client, auth):
    headers = auth('student')
    data = io.BytesIO()
    Image.new('RGB', (80,120), '#7841bd').save(data, 'PNG')
    data.seek(0)
    response = client.put('/api/v1/account-settings/photo', headers=headers, data={'photo':(data,'photo.png')})
    assert response.status_code == 200
    encoded = response.json['settings']['avatar_url'].split(',')[1]
    photo = Image.open(io.BytesIO(base64.b64decode(encoded)))
    assert photo.format == 'JPEG' and photo.size == (384,384)
    assert client.get('/api/v1/account-settings', headers=auth('student2')).json['settings']['avatar_url'] is None
    assert client.put('/api/v1/account-settings/photo', headers=headers, data={'photo':(io.BytesIO(b'<svg/>'),'image.svg')}).status_code == 400
    assert client.put('/api/v1/account-settings/photo', headers=headers, data={'photo':(io.BytesIO(b'x' * (2*1024*1024+1)),'big.png')}).status_code == 413
    assert client.delete('/api/v1/account-settings/photo', headers=headers).json['settings']['avatar_url'] is None


def test_password_change_revokes_access_and_refresh(client):
    first = client.post('/api/v1/auth/login', json={'email':'student@test.local','password':'Password1!'}).json
    second = client.post('/api/v1/auth/login', json={'email':'student@test.local','password':'Password1!'}).json
    headers = {'Authorization':f"Bearer {first['access_token']}"}
    endpoint = '/api/v1/account-settings/password'
    assert client.post(endpoint, headers=headers, json={'current_password':'wrong','new_password':'NewPassword2!'}).status_code == 400
    assert client.post(endpoint, headers=headers, json={'current_password':'Password1!','new_password':'weak'}).status_code == 400
    assert client.post(endpoint, headers=headers, json={'current_password':'Password1!','new_password':'Password1!'}).status_code == 400
    assert client.post(endpoint, headers=headers, json={'current_password':'Password1!','new_password':'NewPassword2!'}).status_code == 200
    for pair in [first, second]:
        assert client.get('/api/v1/auth/me', headers={'Authorization':f"Bearer {pair['access_token']}"}).status_code == 401
        assert client.post('/api/v1/auth/refresh', headers={'Authorization':f"Bearer {pair['refresh_token']}"}).status_code == 401
    assert client.post('/api/v1/auth/login', json={'email':'student@test.local','password':'Password1!'}).status_code == 401
    new = client.post('/api/v1/auth/login', json={'email':'student@test.local','password':'NewPassword2!'}).json
    refreshed = client.post('/api/v1/auth/refresh', headers={'Authorization':f"Bearer {new['refresh_token']}"})
    assert refreshed.status_code == 200
    assert client.get('/api/v1/auth/me', headers={'Authorization':f"Bearer {refreshed.json['access_token']}"}).status_code == 200


def test_inactive_account_cannot_edit(app, client, auth):
    headers = auth('student')
    with app.app_context():
        user = db.session.scalar(db.select(User).filter_by(email='student@test.local'))
        user.is_active = False
        db.session.commit()
    assert client.patch('/api/v1/account-settings', headers=headers, json={'display_name':'No'}).status_code == 403


@pytest.mark.parametrize('path', ['/dashboard','/profile','/appointments','/cases','/referrals','/clearance','/exit-questionnaire','/manage-exit-questionnaire','/admin-management'])
def test_shared_workspace_assets(client, path):
    response = client.get(path)
    assert response.status_code == 200
    assert b'js/workspace.js' in response.data
    assert b'css/workspace.css' in response.data
    assert b'js/navigation.js' in response.data
