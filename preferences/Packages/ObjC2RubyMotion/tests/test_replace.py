import unittest, os, sys
from custom_test_case import CustomTestCase

PROJECT_ROOT = os.path.dirname(__file__)
sys.path.append(os.path.join(PROJECT_ROOT, ".."))

from CodeConverter import CodeConverter

class TestReplace(unittest.TestCase, CustomTestCase):

    def test_replace_nsstring(self):
        source   = 'NSDictionary *updatedLatte = [responseObject objectForKey:@"latte"];'
        expected = 'NSDictionary *updatedLatte = [responseObject objectForKey:"latte"];'
        self.assertSentence(CodeConverter(source).replace_nsstring().s, expected)

    def test_convert_square_brackets_expression(self):
        source   = '[self notifyCreated];'
        expected = 'self.notifyCreated;'
        self.assertSentence(CodeConverter(source).convert_square_brackets_expression().s, expected)

    def test_convert_square_brackets_expression_with_args(self):
        source   = '[self updateFromJSON:updatedLatte];'
        expected = 'self.updateFromJSON(updatedLatte);'
        self.assertSentence(CodeConverter(source).convert_square_brackets_expression().s, expected)

    def test_convert_square_brackets_expression_with_multiple_args(self):
        source   = '[[[UITabBarItem alloc] initWithTabBarSystemItem:UITabBarSystemItemBookmarks tag:0] autorelease];'
        expected = 'UITabBarItem.alloc.initWithTabBarSystemItem(UITabBarSystemItemBookmarks,tag:0).autorelease;'
        self.assertSentence(CodeConverter(source).convert_square_brackets_expression().s, expected)

    def test_remove_semicolon_at_the_end(self):
        source   = '[[[UIWindow alloc] initWithFrame:[[UIScreen mainScreen] bounds]] autorelease];'
        expected = '[[[UIWindow alloc] initWithFrame:[[UIScreen mainScreen] bounds]] autorelease]'
        self.assertSentence(CodeConverter(source).remove_semicolon_at_the_end().s, expected)

    def test_remove_autorelease(self):
        source   = '[[[UIWindow alloc] initWithFrame:[[UIScreen mainScreen] bounds]] autorelease]'
        expected = 'UIWindow.alloc.initWithFrame(UIScreen.mainScreen.bounds)'
        obj = CodeConverter(source).convert_square_brackets_expression()
        obj.remove_autorelease()
        self.assertSentence(obj.s, expected)

    def test_remove_type_declaration(self):
        source   = 'UIWindow* aWindow = [[[UIWindow alloc] initWithFrame:[[UIScreen mainScreen] bounds]] autorelease]'
        expected = 'aWindow = [[[UIWindow alloc] initWithFrame:[[UIScreen mainScreen] bounds]] autorelease]'
        self.assertSentence(CodeConverter(source).remove_type_declaration().s, expected)

    def test_remove_type_declaration_with_lead_spaces(self):
        source   = '    UIWindow* aWindow = [[[UIWindow alloc] initWithFrame:[[UIScreen mainScreen] bounds]] autorelease]'
        expected = '    aWindow = [[[UIWindow alloc] initWithFrame:[[UIScreen mainScreen] bounds]] autorelease]'
        self.assertSentence(CodeConverter(source).remove_type_declaration().s, expected)

    def test_converts_boolean_yes(self):
        source = '[button setAttr:YES];'
        expected = '[button setAttr:true];'
        self.assertSentence(CodeConverter(source).convert_boolean().s, expected)

    def test_converts_boolean_no(self):
        source = '[button setAttr:NO];'
        expected = '[button setAttr:false];'
        self.assertSentence(CodeConverter(source).convert_boolean().s, expected)

    def test_avoid_unexpected_replacement_for_boolean(self):
        source = '[ZNOAuth foo:"NOW"];'
        expected = '[ZNOAuth foo:"NOW"];'
        self.assertSentence(CodeConverter(source).convert_boolean().s, expected)

if __name__ == '__main__':
    unittest.main()
