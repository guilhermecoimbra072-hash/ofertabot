import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bytesMatch,extensionFor,normalizeMime} from '../engine/src/media';
test('mídia aceita jpeg, mp4, ogg e pdf e recusa tipo ou bytes trocados',()=>{
 assert.equal(normalizeMime('audio/ogg; codecs=opus'),'audio/ogg');
 assert.equal(extensionFor('video/mp4'),'mp4');
 assert.equal(extensionFor('application/x-msdownload'),null);
 const jpeg=new Uint8Array(16);jpeg[0]=255;jpeg[1]=216;
 assert.equal(bytesMatch('image/jpeg',jpeg),true);
 const mp4=new Uint8Array(16);mp4.set([0,0,0,0x18],0);mp4.set([0x66,0x74,0x79,0x70],4);
 assert.equal(bytesMatch('video/mp4',mp4),true);
 const ogg=new Uint8Array(16);ogg.set([0x4f,0x67,0x67,0x53],0);
 assert.equal(bytesMatch('audio/ogg; codecs=opus',ogg),true);
 const pdf=new Uint8Array(16);pdf.set([0x25,0x50,0x44,0x46],0);
 assert.equal(bytesMatch('application/pdf',pdf),true);
 assert.equal(bytesMatch('application/pdf',jpeg),false);
 assert.equal(bytesMatch('image/png',jpeg),false);
});
