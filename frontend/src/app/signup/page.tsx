'use client';

import {
  Box,
  Container,
  VStack,
  Heading,
  Text,
  Input,
  Button,
  FormControl,
  FormLabel,
  useToast,
  HStack,
  InputGroup,
  InputRightElement,
  IconButton,
  Checkbox,
  Link as ChakraLink,
} from '@chakra-ui/react';
import { useState } from 'react';
import { FaEye, FaEyeSlash } from 'react-icons/fa';
import Link from 'next/link';
import AppNav from '../components/AppNav';
import { apiUrl } from '@/lib/api';

export default function Signup() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const toast = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (password !== confirmPassword) {
        throw new Error('Passwords do not match');
      }
      if (!acceptTerms) {
        throw new Error('Please accept the terms and conditions');
      }

      const response = await fetch(apiUrl('/auth/signup'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });

      const raw = await response.text();
      let data: any = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = { message: raw };
      }
      if (!response.ok) {
        throw new Error(
          (typeof data === 'string' ? data : null) ||
            data.message ||
            data.error ||
            raw ||
            'Failed to create account'
        );
      }

      toast({
        title: 'Account created',
        description: 'You can now sign in.',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });

      setTimeout(() => {
        window.location.href = '/login';
      }, 1000);
    } catch (error: any) {
      toast({
        title: 'Signup failed',
        description: error.message || 'An unexpected error occurred.',
        status: 'error',
        duration: 3500,
        isClosable: true,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Box minH="100vh" bg="surface.500">
      <AppNav />
      <Container maxW="md" py={{ base: 10, md: 16 }}>
        <VStack spacing={8} align="stretch">
          <Box textAlign="center">
            <Heading size="lg" letterSpacing="-0.03em" mb={2}>
              Create your account
            </Heading>
            <Text color="gray.400">Start analyzing repositories with RepoRadar</Text>
          </Box>

          <Box
            as="form"
            onSubmit={handleSubmit}
            bg="surface.200"
            p={{ base: 5, md: 8 }}
            borderRadius="lg"
            borderWidth="1px"
            borderColor="whiteAlpha.200"
          >
            <VStack spacing={5}>
              <FormControl isRequired>
                <FormLabel>Name</FormLabel>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  autoComplete="name"
                  aria-label="Name"
                />
              </FormControl>

              <FormControl isRequired>
                <FormLabel>Email</FormLabel>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  aria-label="Email"
                />
              </FormControl>

              <FormControl isRequired>
                <FormLabel>Password</FormLabel>
                <InputGroup>
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Create a password"
                    autoComplete="new-password"
                    aria-label="Password"
                  />
                  <InputRightElement>
                    <IconButton
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      icon={showPassword ? <FaEyeSlash /> : <FaEye />}
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowPassword(!showPassword)}
                    />
                  </InputRightElement>
                </InputGroup>
              </FormControl>

              <FormControl isRequired>
                <FormLabel>Confirm password</FormLabel>
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm password"
                  autoComplete="new-password"
                  aria-label="Confirm password"
                />
              </FormControl>

              <Checkbox
                isChecked={acceptTerms}
                onChange={(e) => setAcceptTerms(e.target.checked)}
                alignItems="flex-start"
                colorScheme="teal"
              >
                <Text fontSize="sm" color="gray.300">
                  I agree to the{' '}
                  <ChakraLink as={Link} href="/terms" color="brand.300">
                    Terms
                  </ChakraLink>{' '}
                  and{' '}
                  <ChakraLink as={Link} href="/privacy" color="brand.300">
                    Privacy Policy
                  </ChakraLink>
                </Text>
              </Checkbox>

              <Button type="submit" size="lg" w="full" isLoading={isLoading}>
                Create account
              </Button>
            </VStack>
          </Box>

          <HStack justify="center" spacing={2}>
            <Text color="gray.400">Already have an account?</Text>
            <Button as={Link} href="/login" variant="link" color="brand.300">
              Sign in
            </Button>
          </HStack>
        </VStack>
      </Container>
    </Box>
  );
}
