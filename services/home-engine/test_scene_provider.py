"""Contract tests with a fake provider. These do not evaluate real AI quality."""
import io,json,tempfile,unittest,urllib.error
from pathlib import Path
from unittest.mock import patch
from PIL import Image
import scene_provider as provider

class Response(io.BytesIO):
    def __enter__(self):return self
    def __exit__(self,*args):self.close()

class ProviderTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
        self.state=patch.object(provider,'STATE',self.root);self.config=patch.object(provider,'CONFIG_FILE',self.root/'provider.json');self.state.start();self.config.start()
    def tearDown(self):self.state.stop();self.config.stop();self.temp.cleanup()
    def test_keys_remain_local_and_family_scoped(self):
        key='fixture-key-not-a-real-secret'
        result=provider.configure_provider('family-a',key)
        self.assertTrue(result['configured']);self.assertNotIn(key,json.dumps(result));self.assertFalse(provider.provider_status('family-b')['configured'])
        with self.assertRaises(ValueError):provider.configure_provider('family-a','bad\nheader')
    def test_image_and_json_request_contract(self):
        provider.configure_provider('family-a','fixture-key-not-a-real-secret');path=self.root/'room.png';Image.new('RGB',(40,30),'white').save(path)
        plan={'rooms':[{'id':'room','width':4,'depth':3}],'furniture':[]};calls=[]
        def respond(request,**kwargs):
            calls.append(json.loads(request.data));return Response(json.dumps({'choices':[{'finish_reason':'stop','message':{'content':json.dumps(plan)}}],'usage':{'total_tokens':123}}).encode())
        with patch.object(provider.OPENER,'open',side_effect=respond):result=provider.generate_plan('family-a',[path],'原木厨房')
        self.assertEqual(len(calls),1);self.assertEqual(calls[0]['model'],'deepseek-flash');self.assertEqual(calls[0]['response_format'],{'type':'json_object'})
        self.assertEqual(calls[0]['messages'][1]['content'][1]['type'],'image_url');self.assertTrue(calls[0]['messages'][1]['content'][1]['image_url']['url'].startswith('data:image/jpeg;base64,'))
        self.assertEqual(result['plan'],plan);self.assertEqual(result['usage']['total_tokens'],123);self.assertTrue(provider.provider_status('family-a')['verifiedAt'])
    def test_http_errors_are_redacted_and_never_automatically_retried(self):
        key='fixture-key-not-a-real-secret';provider.configure_provider('a',key);path=self.root/'room.png';Image.new('RGB',(20,20)).save(path)
        with patch.object(provider.OPENER,'open',side_effect=urllib.error.HTTPError(provider.API,401,'invalid '+key,None,None)) as mocked:
            with self.assertRaises(ValueError) as error:provider.generate_plan('a',[path],'')
        self.assertEqual(mocked.call_count,1);self.assertNotIn(key,str(error.exception));self.assertIn('暂时不可用',str(error.exception));self.assertNotIn('DeepSeek',str(error.exception))

if __name__=='__main__':unittest.main(verbosity=2)
