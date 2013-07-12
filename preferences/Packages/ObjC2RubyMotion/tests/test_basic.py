import unittest, os, sys
from custom_test_case import CustomTestCase

PROJECT_ROOT = os.path.dirname(__file__)
sys.path.append(os.path.join(PROJECT_ROOT, ".."))

from CodeConverter import CodeConverter

class TestBasic(unittest.TestCase, CustomTestCase):

    def test_initialize(self):
        self.assertSentence(CodeConverter('foo').s, 'foo')

    # def test_python_version(self):
    #     # Python for Sublime Text 2 is 2.6.7 (r267:88850, Oct 11 2012, 20:15:00)
    #     print('Your version is ' + sys.version)
    #     if sys.version_info[:2] != (2, 6):
    #         print('Sublime Text 2 uses python 2.6.7')
    #     self.assertTrue(True)

if __name__ == '__main__':
    unittest.main()
