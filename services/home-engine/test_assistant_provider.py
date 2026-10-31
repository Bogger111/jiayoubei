"""Model-bridge contracts only; real model evidence is recorded separately."""
import io,json,tempfile,unittest,urllib.error
from pathlib import Path
from unittest.mock import patch
import scene_provider as provider
from assistant_provider import assistant_turn

class Response(io.BytesIO):
    def __enter__(self):return self
    def __exit__(self,*args):self.close()

class AssistantProviderTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
        self.state=patch.object(provider,'STATE',self.root);self.config=patch.object(provider,'CONFIG_FILE',self.root/'provider.json');self.state.start();self.config.start()
        provider.configure_provider('family-a','fixture-private-assistant-key')
    def tearDown(self):self.state.stop();self.config.stop();self.temp.cleanup()
    def test_real_function_call_message_shape_is_preserved(self):
        calls=[];reply={'role':'assistant','content':None,'tool_calls':[{'id':'call_1','type':'function','function':{'name':'devices_list','arguments':'{}'}}]}
        def respond(request,**kwargs):calls.append(json.loads(request.data));return Response(json.dumps({'choices':[{'finish_reason':'tool_calls','message':reply}],'usage':{'total_tokens':123}}).encode())
        with patch.object(provider.OPENER,'open',side_effect=respond):result=assistant_turn('family-a',[{'role':'user','content':'安排阅读'}],[{'type':'function','function':{'name':'devices_list','parameters':{'type':'object','properties':{}}}}])
        self.assertEqual(len(calls),1);self.assertEqual(calls[0]['thinking'],{'type':'disabled'});self.assertEqual(result['message']['tool_calls'],reply['tool_calls']);self.assertEqual(result['usage']['total_tokens'],123);self.assertNotIn('fixture-private-assistant-key',json.dumps(result))
    def test_missing_family_credentials_do_not_send_requests(self):
        with patch.object(provider.OPENER,'open') as send:
            with self.assertRaises(ValueError):assistant_turn('other',[{'role':'user','content':'x'}],[])
        send.assert_not_called()
    def test_http_errors_are_redacted_and_not_automatically_retried(self):
        with patch.object(provider.OPENER,'open',side_effect=urllib.error.HTTPError(provider.API,401,'fixture-private-assistant-key',None,None)) as send:
            with self.assertRaises(ValueError) as error:assistant_turn('family-a',[{'role':'user','content':'x'}],[])
        self.assertEqual(send.call_count,1);self.assertNotIn('fixture-private-assistant-key',str(error.exception));self.assertNotIn('DeepSeek',str(error.exception))
    def test_truncated_results_do_not_masquerade_as_finished_tool_calls(self):
        result={'choices':[{'finish_reason':'length','message':{'content':'partial'}}]}
        with patch.object(provider.OPENER,'open',return_value=Response(json.dumps(result).encode())):
            with self.assertRaises(ValueError):assistant_turn('family-a',[{'role':'user','content':'x'}],[])

if __name__=='__main__':unittest.main(verbosity=2)
