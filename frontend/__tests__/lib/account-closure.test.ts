import { cancellationDecision as decide } from '../../lib/account-closure';
const sku = new Set(['creator', 'power']);
test('cancel only owned, exclusively ChangeRoom subscriptions', () => {
  expect(decide('me','me',undefined,['creator'],sku,false)).toBe('cancel');
  expect(decide('me',undefined,'me',['power'],sku,false)).toBe('cancel');
  expect(decide('me','other','me',['creator'],sku,true)).toBe('review');
  expect(decide('me',null,undefined,['creator'],sku,true)).toBe('review');
  expect(decide('me','me',undefined,['creator','another-project'],sku,false)).toBe('review');
  expect(decide('me','me',undefined,['another-project'],sku,false)).toBe('ignore');
  expect(decide('me','me',undefined,['retired-price'],sku,true)).toBe('review');
});
