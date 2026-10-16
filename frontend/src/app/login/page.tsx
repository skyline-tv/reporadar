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
} from '@chakra-ui/react';
import { useState } from 'react';
import { FaEye, FaEyeSlash } from 'react-icons/fa';
import Link from 'next/link';
import AppNav from '../components/AppNav';
import { apiUrl } from '@/lib/api';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const toast = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch(apiUrl('/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
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
            'Login failed'
        );
      }
      if (!data.token) {
        throw new Error('Login succeeded but no token was returned');
      }

      localStorage.setItem('token', data.token);
      toast({
        title: 'Welcome back',
        status: 'success',
        duration: 2500,
        isClosable: true,
      });

      setTimeout(() => {
        const lastAction = localStorage.getItem('lastAction');
        if (lastAction === 'analysis') {
          window.location.href = '/analysis';
        } else if (lastAction === 'chat') {
          window.location.href = '/chat';
        } else {
          window.location.href = '/dashboard';
        }
      }, 800);
    } catch (error: any) {
      toast({
        title: 'Login failed',
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
              Welcome back
            </Heading>
            <Text color="gray.400">Sign in to continue to RepoRadar</Text>
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
                    placeholder="Enter your password"
                    autoComplete="current-password"
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

              <Button type="submit" size="lg" w="full" isLoading={isLoading}>
                Sign in
              </Button>
            </VStack>
          </Box>

          <HStack justify="center" spacing={2}>
            <Text color="gray.400">Don&apos;t have an account?</Text>
            <Button as={Link} href="/signup" variant="link" color="brand.300">
              Sign up
            </Button>
          </HStack>
        </VStack>
      </Container>
    </Box>
  );
}
